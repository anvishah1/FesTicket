import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EventLocation, {
  type EventLocationData,
} from "@/components/event-create/EventLocation";
import { showToast } from "@/lib/toast";

// EventLocation surfaces validation failures via showToast; mock it.
vi.mock("@/lib/toast", () => ({ showToast: vi.fn() }));
beforeEach(() => vi.mocked(showToast).mockClear());

describe("EventLocation", () => {
  it("renders offline fields by default", () => {
    render(<EventLocation onNext={() => {}} />);
    expect(screen.getByText("Event Location")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("eg: Kerala Startup Mission")
    ).toBeInTheDocument();
    expect(screen.getByText("Map preview will appear here")).toBeInTheDocument();
    // Online-only field is not shown.
    expect(
      screen.queryByPlaceholderText("https://zoom.us / https://meet.google.com")
    ).not.toBeInTheDocument();
  });

  it("switches to the online meeting-link field when Online is chosen", async () => {
    render(<EventLocation onNext={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Online" }));
    expect(
      screen.getByPlaceholderText("https://zoom.us / https://meet.google.com")
    ).toBeInTheDocument();
    // Offline fields are gone.
    expect(
      screen.queryByPlaceholderText("eg: Kerala Startup Mission")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Map preview will appear here")
    ).not.toBeInTheDocument();
  });

  it("blocks offline submit and alerts when the venue is empty", async () => {
    const onNext = vi.fn();
    render(<EventLocation onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(showToast).toHaveBeenCalledWith("Please enter a venue name", "error");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("submits offline data once a venue is entered", async () => {
    const onNext = vi.fn();
    render(<EventLocation onNext={onNext} />);
    await userEvent.type(
      screen.getByPlaceholderText("eg: Kerala Startup Mission"),
      "Main Auditorium"
    );
    await userEvent.type(
      screen.getByPlaceholderText("Street address, city, state"),
      "123 Road, Kochi"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext.mock.calls[0][0]).toMatchObject({
      locationType: "OFFLINE",
      venue: "Main Auditorium",
      address: "123 Road, Kochi",
    });
  });

  it("blocks online submit and alerts when the meeting link is empty", async () => {
    const onNext = vi.fn();
    render(<EventLocation onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Online" }));
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(showToast).toHaveBeenCalledWith("Please enter a meeting link", "error");
    expect(onNext).not.toHaveBeenCalled();
  });

  it("submits online data once a meeting link is entered", async () => {
    const onNext = vi.fn();
    render(<EventLocation onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Online" }));
    await userEvent.type(
      screen.getByPlaceholderText("https://zoom.us / https://meet.google.com"),
      "https://meet.google.com/abc"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext.mock.calls[0][0]).toMatchObject({
      locationType: "ONLINE",
      meetingLink: "https://meet.google.com/abc",
    });
  });

  it("associates the venue and address fields with labels", () => {
    render(<EventLocation onNext={() => {}} />);
    expect(screen.getByLabelText(/Venue Name/)).toBeInTheDocument();
    expect(screen.getByLabelText("Address")).toBeInTheDocument();
  });

  it("labels the meeting-link field in online mode", async () => {
    render(<EventLocation onNext={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Online" }));
    expect(screen.getByLabelText(/Meeting Link/)).toBeInTheDocument();
  });

  it("prefills online meeting link from initialData", () => {
    const initialData: EventLocationData = {
      locationType: "ONLINE",
      venue: "",
      address: "",
      meetingLink: "https://zoom.us/j/123",
    };
    render(<EventLocation onNext={() => {}} initialData={initialData} />);
    expect(screen.getByDisplayValue("https://zoom.us/j/123")).toBeInTheDocument();
  });
});
