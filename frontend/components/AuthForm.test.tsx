import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthForm from "@/components/AuthForm";
import { getStoredUser } from "@/lib/auth";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

function successResponse(user: { role: string }) {
  return {
    ok: true,
    json: async () => ({
      success: true,
      data: {
        accessToken: "acc",
        refreshToken: "ref",
        user: { id: 1, email: "u@x.com", role: user.role, profileCompleted: true },
      },
    }),
  };
}

async function fillCredentials() {
  await userEvent.type(screen.getByLabelText("Email"), "u@x.com");
  await userEvent.type(screen.getByLabelText("Password"), "secret1");
}

describe("AuthForm", () => {
  it("disables the submit button until both fields are filled", async () => {
    render(<AuthForm />);
    const submit = screen.getByRole("button", { name: /sign in with email/i });
    expect(submit).toBeDisabled();
    await fillCredentials();
    expect(submit).toBeEnabled();
  });

  it("posts credentials to the signin endpoint and routes ADMIN to the admin dashboard", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      successResponse({ role: "ADMIN" })
    );
    render(<AuthForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: /sign in with email/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/admin/dashboard"));

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://localhost:4000/api/auth/signin",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(
      (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body
    );
    // Includes the captchaToken field (placeholder "dev" when no site key is set).
    expect(body).toEqual({
      email: "u@x.com",
      password: "secret1",
      captchaToken: "dev",
    });
    expect(body.captchaToken).toBe("dev");
    // setAuth persisted the returned user
    expect(getStoredUser()?.role).toBe("ADMIN");
  });

  it("routes an EDITOR to the host dashboard", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      successResponse({ role: "EDITOR" })
    );
    render(<AuthForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/host/dashboard"));
  });

  it("routes a HOST to the host dashboard", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      successResponse({ role: "HOST" })
    );
    render(<AuthForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/host/dashboard"));
  });

  it("routes any other role to the home page", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      successResponse({ role: "VIEWER" })
    );
    render(<AuthForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/"));
  });

  it("requests a magic sign-in link and shows the generic confirmation (AUTH-06)", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    render(<AuthForm />);
    // The button is enabled once an email is present (no password needed).
    await userEvent.type(screen.getByLabelText("Email"), "u@x.com");
    await userEvent.click(screen.getByTestId("magic-link-button"));

    await waitFor(() =>
      expect(globalThis.fetch).toHaveBeenCalledWith(
        "http://localhost:4000/api/auth/magic-link",
        expect.objectContaining({ method: "POST" })
      )
    );
    expect(await screen.findByTestId("magic-sent")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows the server error message on a non-ok response", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Wrong password" } }),
    });
    render(<AuthForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    expect(await screen.findByText("Wrong password")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a lockout countdown + recovery link and disables submit on a locked 403 (AUTH-09)", async () => {
    const lockUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: {
          code: "ACCOUNT_LOCKED",
          message: "Account locked. Try again later.",
          details: { lockUntil, retryAfterSeconds: 300 },
        },
      }),
    });
    render(<AuthForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: /sign in with email/i }));

    expect(await screen.findByText(/account locked/i)).toBeInTheDocument();
    const countdown = await screen.findByTestId("lock-countdown");
    expect(countdown.textContent).toMatch(/^0[45]:\d{2}$/); // ~05:00
    expect(screen.getByRole("link", { name: /reset your password/i })).toHaveAttribute("href", "/forgot");
    // While locked the submit button is disabled and labelled with the countdown.
    expect(screen.getByRole("button", { name: /locked/i })).toBeDisabled();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a connectivity error when the request rejects", async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("network down")
    );
    render(<AuthForm />);
    await fillCredentials();
    await userEvent.click(screen.getByRole("button", { name: /sign in with email/i }));
    expect(
      await screen.findByText("Could not reach server. Please try again.")
    ).toBeInTheDocument();
  });

  it("validates empty input on direct form submit without calling fetch", async () => {
    const { container } = render(<AuthForm />);
    const form = container.querySelector("form")!;
    fireEvent.submit(form);
    expect(
      await screen.findByText("Please enter email and password.")
    ).toBeInTheDocument();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("renders the Google button disabled (coming soon) and never navigates", async () => {
    render(<AuthForm />);
    const googleBtn = screen.getByRole("button", { name: /sign in with google/i });
    expect(googleBtn).toBeDisabled();
    await userEvent.click(googleBtn);
    expect(push).not.toHaveBeenCalled();
  });
});
