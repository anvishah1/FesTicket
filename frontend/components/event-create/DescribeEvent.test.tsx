import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DescribeEvent, {
  type DescribeEventData,
} from "@/components/event-create/DescribeEvent";

describe("DescribeEvent", () => {
  it("renders the heading and category tags", () => {
    render(<DescribeEvent onNext={() => {}} />);
    expect(screen.getByText("Describe Your Event")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workshop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hackathon" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Other" })).toBeInTheDocument();
  });

  it("updates the description as the user types", async () => {
    render(<DescribeEvent onNext={() => {}} />);
    const input = screen.getByPlaceholderText(
      "Tell people what your event is about, what they can expect, and why they should attend."
    );
    await userEvent.type(input, "An awesome event");
    expect(input).toHaveValue("An awesome event");
  });

  it("updates the audience field as the user types", async () => {
    render(<DescribeEvent onNext={() => {}} />);
    const input = screen.getByPlaceholderText(
      "Who should attend this event? (eg: students, founders, developers)"
    );
    await userEvent.type(input, "students");
    expect(input).toHaveValue("students");
  });

  it("submits with the default Workshop category when nothing is changed", async () => {
    const onNext = vi.fn();
    render(<DescribeEvent onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onNext.mock.calls[0][0].category).toBe("Workshop");
  });

  it("selects a different category and reports it via onNext", async () => {
    const onNext = vi.fn();
    render(<DescribeEvent onNext={onNext} />);
    await userEvent.click(screen.getByRole("button", { name: "Concert" }));
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext.mock.calls[0][0].category).toBe("Concert");
  });

  it("passes typed description and audience through onNext", async () => {
    const onNext = vi.fn();
    render(<DescribeEvent onNext={onNext} />);
    await userEvent.type(
      screen.getByPlaceholderText(
        "Tell people what your event is about, what they can expect, and why they should attend."
      ),
      "Details here"
    );
    await userEvent.type(
      screen.getByPlaceholderText(
        "Who should attend this event? (eg: students, founders, developers)"
      ),
      "developers"
    );
    await userEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
    expect(onNext.mock.calls[0][0]).toMatchObject({
      description: "Details here",
      audience: "developers",
      category: "Workshop",
    });
  });

  it("associates the description and audience textareas with labels", () => {
    render(<DescribeEvent onNext={() => {}} />);
    expect(screen.getByLabelText("Event Description")).toBeInTheDocument();
    expect(screen.getByLabelText("Intended Audience")).toBeInTheDocument();
  });

  it("prefills from initialData", () => {
    const initialData: DescribeEventData = {
      description: "Prefilled description",
      category: "Sports",
      audience: "Prefilled audience",
    };
    render(<DescribeEvent onNext={() => {}} initialData={initialData} />);
    expect(screen.getByDisplayValue("Prefilled description")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Prefilled audience")).toBeInTheDocument();
  });
});
