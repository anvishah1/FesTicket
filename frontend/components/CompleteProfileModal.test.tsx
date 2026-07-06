import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CompleteProfileModal from "@/components/CompleteProfileModal";

async function fillAll() {
  const inputs = screen.getAllByRole("textbox");
  await userEvent.type(inputs[0], "John"); // firstName
  await userEvent.type(inputs[1], "Doe"); // lastName
  await userEvent.type(inputs[2], "Acme"); // organiserName
  await userEvent.type(inputs[3], "9876543210"); // phone (>= 10 chars)
}

describe("CompleteProfileModal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <CompleteProfileModal open={false} onSubmit={vi.fn()} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the modal with four fields and a disabled submit when open", () => {
    render(<CompleteProfileModal open onSubmit={vi.fn()} />);
    expect(screen.getByText("Basic Profile")).toBeInTheDocument();
    expect(screen.getAllByRole("textbox")).toHaveLength(4);
    expect(screen.getByRole("button", { name: /update & continue/i })).toBeDisabled();
  });

  it("keeps the submit disabled while the phone number is shorter than 10 chars", async () => {
    render(<CompleteProfileModal open onSubmit={vi.fn()} />);
    const inputs = screen.getAllByRole("textbox");
    await userEvent.type(inputs[0], "John");
    await userEvent.type(inputs[1], "Doe");
    await userEvent.type(inputs[2], "Acme");
    await userEvent.type(inputs[3], "12345"); // only 5 chars
    expect(screen.getByRole("button", { name: /update & continue/i })).toBeDisabled();
  });

  it("enables submit and calls onSubmit with the form data once all fields are valid", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CompleteProfileModal open onSubmit={onSubmit} />);
    await fillAll();

    const submit = screen.getByRole("button", { name: /update & continue/i });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(onSubmit).toHaveBeenCalledWith({
      firstName: "John",
      lastName: "Doe",
      organiserName: "Acme",
      phone: "9876543210",
    });
  });

  it("shows a saving state while the submit promise is pending, then restores", async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(
      () => new Promise<void>((r) => (resolve = r))
    );
    render(<CompleteProfileModal open onSubmit={onSubmit} />);
    await fillAll();

    await userEvent.click(screen.getByRole("button", { name: /update & continue/i }));
    expect(screen.getByRole("button", { name: /saving/i })).toBeInTheDocument();

    resolve();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /update & continue/i })
      ).toBeInTheDocument()
    );
  });

  it("associates each field with its visible label (accessible name)", () => {
    render(<CompleteProfileModal open onSubmit={vi.fn()} />);
    // Label association means each input is reachable by its label text.
    expect(screen.getByLabelText("First Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Last Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Organiser Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Phone Number")).toBeInTheDocument();
    // Required fields expose aria-required for assistive tech.
    expect(screen.getByLabelText("First Name")).toHaveAttribute("aria-required", "true");
  });

  it("exposes an accessible dialog with a labelled title", () => {
    render(<CompleteProfileModal open onSubmit={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "complete-profile-title");
    expect(screen.getByText("Basic Profile")).toHaveAttribute(
      "id",
      "complete-profile-title"
    );
  });

  it("shows an inline error (no reload) when onSubmit rejects, then restores the button", async () => {
    const onSubmit = vi
      .fn()
      .mockRejectedValue(new Error("Could not save your profile"));
    render(<CompleteProfileModal open onSubmit={onSubmit} />);
    await fillAll();

    await userEvent.click(
      screen.getByRole("button", { name: /update & continue/i })
    );

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        /could not save your profile/i
      )
    );
    // The modal stays open and usable (no window.location.reload loop).
    expect(
      screen.getByRole("button", { name: /update & continue/i })
    ).toBeEnabled();
  });

  it("is not dismissible by default: no close button and Escape does nothing", async () => {
    const onClose = vi.fn();
    render(<CompleteProfileModal open onSubmit={vi.fn()} onClose={onClose} />);
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
    await userEvent.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("when dismissible, the close button and Escape call onClose", async () => {
    const onClose = vi.fn();
    render(
      <CompleteProfileModal open dismissible onSubmit={vi.fn()} onClose={onClose} />
    );
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
