import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import ServiceWorkerRegistrar from "@/components/ServiceWorkerRegistrar";

const register = vi.fn();
const getRegistrations = vi.fn();

beforeEach(() => {
  register.mockReset().mockResolvedValue({ addEventListener: vi.fn() });
  getRegistrations.mockReset().mockResolvedValue([]);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register, getRegistrations, controller: null },
  });
  // jsdom reports document.readyState "complete", so registration runs inline.
});

afterEach(() => {
  vi.unstubAllEnvs();
  // @ts-expect-error cleanup the stubbed property
  delete navigator.serviceWorker;
});

describe("ServiceWorkerRegistrar (TIX-08)", () => {
  it("registers /sw.js in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<ServiceWorkerRegistrar />);
    await waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
    expect(getRegistrations).not.toHaveBeenCalled();
  });

  it("does not register outside production and tears down stale workers", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const stale = { unregister: vi.fn() };
    getRegistrations.mockResolvedValue([stale]);
    render(<ServiceWorkerRegistrar />);
    await waitFor(() => expect(getRegistrations).toHaveBeenCalled());
    expect(register).not.toHaveBeenCalled();
    await waitFor(() => expect(stale.unregister).toHaveBeenCalled());
  });
});
