import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SecurityPage from "./page";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: (props: any) => <img alt={props.alt} src={props.src} />,
}));
vi.mock("@/components/Header", () => ({ default: () => <header /> }));
vi.mock("@/components/Footer", () => ({ default: () => <footer /> }));
const showToast = vi.fn();
vi.mock("@/lib/toast", () => ({ showToast: (...a: unknown[]) => showToast(...a) }));
const apiFetch = vi.fn();
vi.mock("@/lib/auth", () => ({
  apiFetch: (...a: unknown[]) => apiFetch(...a),
  isAuthenticated: () => true,
}));

const json = (data: unknown, ok = true) => ({ ok, json: async () => ({ success: ok, data }) });

beforeEach(() => {
  apiFetch.mockReset();
  showToast.mockReset();
});

describe("SecurityPage (AUTH-08)", () => {
  it("shows the off state and walks enrollment through to backup codes", async () => {
    apiFetch
      .mockResolvedValueOnce(json({ twoFactorEnabled: false })) // /me
      .mockResolvedValueOnce(json({ qrDataUrl: "data:image/png;base64,QQ==", secret: "JBSW", otpauthUrl: "otpauth://x" })) // setup
      .mockResolvedValueOnce(json({ backupCodes: ["AAAA-1111", "BBBB-2222"] })); // enable

    render(<SecurityPage />);
    await userEvent.click(await screen.findByTestId("enable-2fa"));

    // QR appears; enter a code and confirm.
    expect(await screen.findByAltText("2FA QR code")).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("enroll-code"), "123456");
    await userEvent.click(screen.getByTestId("confirm-2fa"));

    // Backup codes shown once.
    const codes = await screen.findByTestId("backup-codes");
    expect(codes).toHaveTextContent("AAAA-1111");
    expect(codes).toHaveTextContent("BBBB-2222");
    expect(showToast).toHaveBeenCalledWith("Two-factor authentication enabled", "success");
  });

  it("shows the on state with a disable control when already enabled", async () => {
    apiFetch.mockResolvedValueOnce(json({ twoFactorEnabled: true }));
    render(<SecurityPage />);
    expect(await screen.findByTestId("disable-2fa")).toBeInTheDocument();
  });
});
