import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventBasics, { type EventBasicsData } from "@/components/event-create/EventBasics";

// EventBasics calls window.alert on validation failures; stub it once.
const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

const filledData: EventBasicsData = {
  name: "KSUM Meet",
  shortDescription: "A short blurb",
  image: null,
  startDate: "",
  endDate: "",
  visibility: "PRIVATE",
  eventType: "OFFLINE",
};

describe("EventBasics", () => {
  it("renders the heading and core fields", () => {
    render(<EventBasics onNext={() => {}} />);
    expect(screen.getByText("Event Basics")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("eg: KSUM Investor's Meet")
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Describe your event in one or two lines")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save & Continue" })).toBeInTheDocument();
  });

  it("updates the event name as the user types", async () => {
    render(<EventBasics onNext={() => {}} />);
    const input = screen.getByPlaceholderText("eg: KSUM Investor's Meet");
    await userEvent.type(input, "Robotics Fest");
    expect(input).toHaveValue("Robotics Fest");
  });

  it("updates the short description as the user types", async () => {
    render(<EventBasics onNext={() => {}} />);
    const input = screen.getByPlaceholderText(
      "Describe your event in one or two lines"
    );
    await userEvent.type(input, "Two line summary");
    expect(input).toHaveValue("Two line summary");
  });

  it("blocks submit and alerts when the name is empty", async () => {
    const onNext = vi.fn();
    render(<EventBasics onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(alertSpy).toHaveBeenCalledWith("Please enter an event name");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("calls onNext with the form data when the name is present", async () => {
    const onNext = vi.fn();
    render(<EventBasics onNext={onNext} />);
    await userEvent.type(
      screen.getByPlaceholderText("eg: KSUM Investor's Meet"),
      "Hackathon"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext.mock.calls[0][0]).toMatchObject({
      name: "Hackathon",
      visibility: "PRIVATE",
      eventType: "OFFLINE",
    });
  });

  it("toggles visibility to PUBLIC", async () => {
    const onNext = vi.fn();
    render(<EventBasics onNext={onNext} />);
    await userEvent.type(
      screen.getByPlaceholderText("eg: KSUM Investor's Meet"),
      "Concert"
    );
    await userEvent.click(screen.getByRole("button", { name: "Public" }));
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext.mock.calls[0][0].visibility).toBe("PUBLIC");
  });

  it("toggles event type to ONLINE", async () => {
    const onNext = vi.fn();
    render(<EventBasics onNext={onNext} />);
    await userEvent.type(
      screen.getByPlaceholderText("eg: KSUM Investor's Meet"),
      "Webinar"
    );
    await userEvent.click(screen.getByRole("button", { name: "Online" }));
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext.mock.calls[0][0].eventType).toBe("ONLINE");
  });

  it("reveals the default image grid and selects an image", async () => {
    render(<EventBasics onNext={() => {}} />);
    // Grid hidden initially.
    expect(
      screen.queryByText("Select a default image (all sized for event cards):")
    ).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Choose Default" }));
    expect(
      screen.getByText("Select a default image (all sized for event cards):")
    ).toBeInTheDocument();

    const concertButton = screen.getByAltText("Concert").closest("button")!;
    await userEvent.click(concertButton);

    // Selecting an image shows the preview and hides the grid.
    expect(screen.getByAltText("Event")).toBeInTheDocument();
    expect(
      screen.queryByText("Select a default image (all sized for event cards):")
    ).not.toBeInTheDocument();
  });

  it("alerts when a start date is in the past", () => {
    const { container } = render(<EventBasics onNext={() => {}} />);
    const [startInput] = container.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]'
    );
    fireEvent.change(startInput, { target: { value: "2000-01-01T10:00" } });
    expect(alertSpy).toHaveBeenCalledWith("Start date cannot be in the past.");
  });

  it("alerts when picking an end date before a start date is set", () => {
    const { container } = render(<EventBasics onNext={() => {}} />);
    const inputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]'
    );
    const endInput = inputs[1];
    fireEvent.change(endInput, { target: { value: "2099-12-31T10:00" } });
    expect(alertSpy).toHaveBeenCalledWith("Select start date first");
  });

  it("accepts a valid future start date and updates the display", () => {
    const { container } = render(<EventBasics onNext={() => {}} />);
    // Both date fields show the placeholder before selection.
    expect(screen.getAllByText("Select date & time")).toHaveLength(2);

    const [startInput] = container.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]'
    );
    fireEvent.change(startInput, { target: { value: "2099-12-31T10:00" } });

    // Only the end field still shows the placeholder now.
    expect(screen.getAllByText("Select date & time")).toHaveLength(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("rejects a non-image upload inline without setting an image", async () => {
    const { container } = render(<EventBasics onNext={() => {}} />);
    const fileInput = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const badFile = new File(["hello"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [badFile] } });
    expect(
      await screen.findByText(/please choose an image file/i)
    ).toBeInTheDocument();
    // No preview image was set.
    expect(screen.queryByAltText("Event")).not.toBeInTheDocument();
  });

  it("reports edits continuously via onChange (data-loss fix)", async () => {
    const onChange = vi.fn();
    render(<EventBasics onNext={() => {}} onChange={onChange} />);
    await userEvent.type(
      screen.getByPlaceholderText("eg: KSUM Investor's Meet"),
      "Fest"
    );
    const last = onChange.mock.calls.at(-1)?.[0] as EventBasicsData;
    expect(last.name).toBe("Fest");
  });

  it("clears an already-set end date when the start moves past it", () => {
    const { container } = render(<EventBasics onNext={() => {}} />);
    const [startInput, endInput] = container.querySelectorAll<HTMLInputElement>(
      'input[type="datetime-local"]'
    );
    // Valid start, then a valid end after it.
    fireEvent.change(startInput, { target: { value: "2099-12-31T10:00" } });
    fireEvent.change(endInput, { target: { value: "2099-12-31T12:00" } });
    alertSpy.mockClear();
    // Move the start past the chosen end -> end must be dropped and flagged.
    fireEvent.change(startInput, { target: { value: "2099-12-31T13:00" } });
    expect(alertSpy).toHaveBeenCalledWith(
      "End date must be after the start date — please pick it again."
    );
    // End reverts to the placeholder (was cleared).
    expect(screen.getAllByText("Select date & time")).toHaveLength(1);
  });

  it("associates the name and short-description fields with their labels", () => {
    render(<EventBasics onNext={() => {}} />);
    expect(screen.getByLabelText(/Event Name/)).toBeInTheDocument();
    expect(screen.getByLabelText("Short Description")).toBeInTheDocument();
  });

  it("exposes both datetime fields by their labels and keeps them keyboard-operable", () => {
    render(<EventBasics onNext={() => {}} />);
    const start = screen.getByLabelText("Event Starts From") as HTMLInputElement;
    const end = screen.getByLabelText("Event Ends On") as HTMLInputElement;
    expect(start).toHaveAttribute("type", "datetime-local");
    expect(end).toHaveAttribute("type", "datetime-local");
    // The overlay input must NOT be pointer/keyboard-blocked or removed from the
    // tab order (the old pointer-events-none / tabindex=-1 made it inoperable).
    expect(start.className).not.toContain("pointer-events-none");
    expect(start).not.toBeDisabled();
    expect(start.getAttribute("tabindex")).not.toBe("-1");
  });

  it("sets both dates via keyboard-style change events on the labeled inputs", () => {
    render(<EventBasics onNext={() => {}} />);
    const start = screen.getByLabelText("Event Starts From") as HTMLInputElement;
    const end = screen.getByLabelText("Event Ends On") as HTMLInputElement;
    fireEvent.change(start, { target: { value: "2099-12-31T10:00" } });
    fireEvent.change(end, { target: { value: "2099-12-31T12:00" } });
    expect(start.value).toBe("2099-12-31T10:00");
    expect(end.value).toBe("2099-12-31T12:00");
  });

  it("exposes visibility and event-type options as pressable toggles", () => {
    render(<EventBasics onNext={() => {}} />);
    expect(screen.getByRole("button", { name: "Private" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Public" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
    expect(screen.getByRole("button", { name: "Offline" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("prefills fields from initialData and passes them through onNext", async () => {
    const onNext = vi.fn();
    render(<EventBasics onNext={onNext} initialData={filledData} />);
    expect(screen.getByPlaceholderText("eg: KSUM Investor's Meet")).toHaveValue(
      "KSUM Meet"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext.mock.calls[0][0]).toMatchObject({
      name: "KSUM Meet",
      shortDescription: "A short blurb",
    });
  });
});
