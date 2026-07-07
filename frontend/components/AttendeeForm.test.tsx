import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AttendeeForm, { parseAttendeeCsv } from "@/components/AttendeeForm";

describe("AttendeeForm", () => {
  it("renders the attendees count against the required count", () => {
    render(
      <AttendeeForm
        requiredCount={2}
        attendees={[
          { name: "A", email: "a@x.com" },
          { name: "B", email: "b@x.com" },
        ]}
        onChange={() => {}}
      />
    );
    expect(screen.getByText(/Attendees \(2\/2\)/)).toBeInTheDocument();
  });

  it("renders an input pair for each attendee prefilled from props", () => {
    render(
      <AttendeeForm
        requiredCount={2}
        attendees={[{ name: "Alice", email: "alice@x.com" }]}
        onChange={() => {}}
      />
    );
    expect(screen.getByLabelText("Name for attendee 1")).toHaveValue("Alice");
    expect(screen.getByLabelText("Email for attendee 1")).toHaveValue("alice@x.com");
  });

  it("adds an empty attendee when '+ Add attendee' is clicked below capacity", async () => {
    const onChange = vi.fn();
    render(<AttendeeForm requiredCount={2} attendees={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /add attendee/i }));
    expect(onChange).toHaveBeenCalledWith([{ name: "", email: "" }]);
  });

  it("disables the add button and does not add when already at capacity", async () => {
    const onChange = vi.fn();
    render(
      <AttendeeForm
        requiredCount={2}
        attendees={[
          { name: "A", email: "a@x.com" },
          { name: "B", email: "b@x.com" },
        ]}
        onChange={onChange}
      />
    );
    const addBtn = screen.getByRole("button", { name: /add attendee/i });
    expect(addBtn).toBeDisabled();
    await userEvent.click(addBtn);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes the selected attendee", async () => {
    const onChange = vi.fn();
    render(
      <AttendeeForm
        requiredCount={2}
        attendees={[
          { name: "A", email: "a@x.com" },
          { name: "B", email: "b@x.com" },
        ]}
        onChange={onChange}
      />
    );
    await userEvent.click(screen.getByLabelText("Remove attendee 1"));
    expect(onChange).toHaveBeenCalledWith([{ name: "B", email: "b@x.com" }]);
  });

  it("propagates a name edit through onChange", async () => {
    const onChange = vi.fn();
    render(
      <AttendeeForm
        requiredCount={1}
        attendees={[{ name: "", email: "" }]}
        onChange={onChange}
      />
    );
    await userEvent.type(screen.getByLabelText("Name for attendee 1"), "J");
    expect(onChange).toHaveBeenCalledWith([{ name: "J", email: "" }]);
  });

  it("propagates an email edit through onChange", async () => {
    const onChange = vi.fn();
    render(
      <AttendeeForm
        requiredCount={1}
        attendees={[{ name: "", email: "" }]}
        onChange={onChange}
      />
    );
    await userEvent.type(screen.getByLabelText("Email for attendee 1"), "z");
    expect(onChange).toHaveBeenCalledWith([{ name: "", email: "z" }]);
  });

  it("imports attendees from a CSV file, capped at requiredCount (TIX-10)", async () => {
    const onChange = vi.fn();
    render(<AttendeeForm requiredCount={2} attendees={[]} onChange={onChange} />);
    const csv = "name,email\nAlice,a@x.com\nBob,b@x.com\nCarol,c@x.com\n";
    const file = new File([csv], "attendees.csv", { type: "text/csv" });
    await userEvent.upload(screen.getByTestId("attendee-csv-input"), file);
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        { name: "Alice", email: "a@x.com" },
        { name: "Bob", email: "b@x.com" },
      ])
    );
    expect(screen.getByTestId("csv-import-msg")).toHaveTextContent(/Imported 2 of 3 rows/i);
  });
});

describe("parseAttendeeCsv (TIX-10)", () => {
  it("skips a name,email header row", () => {
    expect(parseAttendeeCsv("name,email\nAlice,a@x.com")).toEqual([{ name: "Alice", email: "a@x.com" }]);
  });

  it("respects header column order when reversed", () => {
    expect(parseAttendeeCsv("email,name\na@x.com,Alice")).toEqual([{ name: "Alice", email: "a@x.com" }]);
  });

  it("assumes name,email when there is no header", () => {
    expect(parseAttendeeCsv("Alice,a@x.com\nBob,b@x.com")).toEqual([
      { name: "Alice", email: "a@x.com" },
      { name: "Bob", email: "b@x.com" },
    ]);
  });

  it("ignores blank lines, extra columns, and surrounding quotes", () => {
    expect(parseAttendeeCsv('"Alice","a@x.com","GA"\n\n  \nBob,b@x.com')).toEqual([
      { name: "Alice", email: "a@x.com" },
      { name: "Bob", email: "b@x.com" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseAttendeeCsv("")).toEqual([]);
  });
});
