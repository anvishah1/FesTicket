import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ClientRoot from "./_ClientRoot";
import { setAuth } from "@/lib/auth";

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init))
  );
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const storedUser = {
  id: 1,
  email: "a@b.com",
  role: "EDITOR",
  profileCompleted: false,
};

beforeEach(() => {
  localStorage.clear();
});

describe("ClientRoot (root auth + profile modal)", () => {
  it("makes NO /me call for anonymous visitors and still renders children", async () => {
    const fetchFn = mockFetch(() => jsonResponse({}));
    render(
      <ClientRoot>
        <div>public content</div>
      </ClientRoot>
    );

    expect(await screen.findByText("public content")).toBeInTheDocument();
    expect(fetchFn).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("prompts EDITOR with an incomplete profile", async () => {
    setAuth("tok", "ref", storedUser);
    mockFetch((url) => {
      if (url.includes("/api/user/me")) {
        return jsonResponse({ role: "EDITOR", profileCompleted: false });
      }
      return jsonResponse({});
    });

    render(
      <ClientRoot>
        <div>app</div>
      </ClientRoot>
    );

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Basic Profile")).toBeInTheDocument();
  });

  it("does NOT prompt a plain VIEWER who is just browsing", async () => {
    setAuth("tok", "ref", { ...storedUser, role: "VIEWER" });
    mockFetch((url) => {
      if (url.includes("/api/user/me")) {
        return jsonResponse({ role: "VIEWER", profileCompleted: false });
      }
      return jsonResponse({});
    });

    render(
      <ClientRoot>
        <div>app</div>
      </ClientRoot>
    );

    expect(await screen.findByText("app")).toBeInTheDocument();
    // Give any (unexpected) modal a chance to appear.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows an inline error instead of reloading when saving the profile fails", async () => {
    setAuth("tok", "ref", storedUser);
    mockFetch((url) => {
      if (url.includes("/api/user/me")) {
        return jsonResponse({ role: "EDITOR", profileCompleted: false });
      }
      if (url.includes("/api/user/complete-profile")) {
        return jsonResponse({ message: "Session expired" }, false, 401);
      }
      return jsonResponse({});
    });

    render(
      <ClientRoot>
        <div>app</div>
      </ClientRoot>
    );

    await screen.findByRole("dialog");
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "John");
    await userEvent.type(inputs[1], "Doe");
    await userEvent.type(inputs[2], "Acme");
    await userEvent.type(inputs[3], "9876543210");
    await userEvent.click(
      screen.getByRole("button", { name: /update & continue/i })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/session expired/i)
    );
    // Modal is still open — no reload loop.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the modal without a hard reload once the profile saves", async () => {
    setAuth("tok", "ref", storedUser);
    mockFetch((url) => {
      if (url.includes("/api/user/me")) {
        return jsonResponse({ role: "EDITOR", profileCompleted: false });
      }
      if (url.includes("/api/user/complete-profile")) {
        return jsonResponse({ profileCompleted: true });
      }
      return jsonResponse({});
    });

    render(
      <ClientRoot>
        <div>app</div>
      </ClientRoot>
    );

    await screen.findByRole("dialog");
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "John");
    await userEvent.type(inputs[1], "Doe");
    await userEvent.type(inputs[2], "Acme");
    await userEvent.type(inputs[3], "9876543210");
    await userEvent.click(
      screen.getByRole("button", { name: /update & continue/i })
    );

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});
