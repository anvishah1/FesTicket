import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import WalletButtons from "@/components/WalletButtons";

vi.mock("@/lib/auth", () => ({ getApiUrl: () => "http://localhost:4000" }));

describe("WalletButtons (TIX-07)", () => {
  it("renders nothing when neither wallet is available", () => {
    const { container } = render(<WalletButtons bookingCode="BK1" apple={false} google={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an Apple Wallet download link to the pkpass endpoint", () => {
    render(<WalletButtons bookingCode="BK1" apple google={false} />);
    const link = screen.getByTestId("apple-wallet-button");
    expect(link).toHaveAttribute("href", "http://localhost:4000/api/bookings/code/BK1/apple-pass");
    expect(screen.queryByTestId("google-wallet-button")).toBeNull();
  });

  it("renders a Google Wallet link using the endpoint redirect mode", () => {
    render(<WalletButtons bookingCode="BK1" apple={false} google />);
    const link = screen.getByTestId("google-wallet-button");
    expect(link).toHaveAttribute("href", "http://localhost:4000/api/bookings/code/BK1/google-pass?redirect=1");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("threads the per-attendee ticketCode into both links", () => {
    render(<WalletButtons bookingCode="BK1" ticketCode="tkt_x" apple google />);
    expect(screen.getByTestId("apple-wallet-button")).toHaveAttribute(
      "href",
      "http://localhost:4000/api/bookings/code/BK1/apple-pass?ticketCode=tkt_x"
    );
    expect(screen.getByTestId("google-wallet-button")).toHaveAttribute(
      "href",
      "http://localhost:4000/api/bookings/code/BK1/google-pass?ticketCode=tkt_x&redirect=1"
    );
  });
});
