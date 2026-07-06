import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RegistrationForm, {
  type RegistrationFormData,
} from "@/components/event-create/RegistrationForm";

describe("RegistrationForm", () => {
  it("renders the heading, locked default fields and the seed question", () => {
    render(<RegistrationForm onSubmit={() => {}} />);
    expect(screen.getByText("Registration Form")).toBeInTheDocument();
    expect(screen.getByText("First Name")).toBeInTheDocument();
    expect(screen.getByText("Last Name")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Phone Number")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("Why do you want to attend this event?")
    ).toBeInTheDocument();
    // Single question -> no Remove control.
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("adds another question", async () => {
    render(<RegistrationForm onSubmit={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "+ Add another question" })
    );
    expect(screen.getByText("Question 2")).toBeInTheDocument();
    expect(screen.getAllByText("Remove")).toHaveLength(2);
  });

  it("removes a question", async () => {
    render(<RegistrationForm onSubmit={() => {}} />);
    await userEvent.click(
      screen.getByRole("button", { name: "+ Add another question" })
    );
    expect(screen.getByText("Question 2")).toBeInTheDocument();
    await userEvent.click(screen.getAllByText("Remove")[0]);
    expect(screen.queryByText("Question 2")).not.toBeInTheDocument();
  });

  it("edits a question label and toggles required, reporting them on submit", async () => {
    const onSubmit = vi.fn();
    render(<RegistrationForm onSubmit={onSubmit} />);
    const input = screen.getByDisplayValue("Why do you want to attend this event?");
    await userEvent.clear(input);
    await userEvent.type(input, "What is your t-shirt size?");
    await userEvent.click(screen.getByLabelText("Required"));
    await userEvent.click(screen.getByRole("button", { name: "Create Event" }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as RegistrationFormData;
    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0]).toMatchObject({
      label: "What is your t-shirt size?",
      type: "text",
      required: true,
    });
  });

  it("lets the host pick an answer type and reports it on submit", async () => {
    const onSubmit = vi.fn();
    render(<RegistrationForm onSubmit={onSubmit} />);
    await userEvent.selectOptions(
      screen.getByLabelText("Answer type for question 1"),
      "number"
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Event" }));

    const payload = onSubmit.mock.calls[0][0] as RegistrationFormData;
    expect(payload.questions[0]).toMatchObject({ type: "number" });
  });

  it("filters out questions with blank labels on submit", async () => {
    const onSubmit = vi.fn();
    render(<RegistrationForm onSubmit={onSubmit} />);
    await userEvent.clear(
      screen.getByDisplayValue("Why do you want to attend this event?")
    );
    await userEvent.click(screen.getByRole("button", { name: "Create Event" }));
    const payload = onSubmit.mock.calls[0][0] as RegistrationFormData;
    expect(payload.questions).toHaveLength(0);
  });

  it("shows a loading label and disables the button while submitting", () => {
    render(<RegistrationForm onSubmit={() => {}} isSubmitting />);
    expect(screen.getByText("Creating Event...")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Creating Event/ })
    ).toBeDisabled();
  });

  it("labels the question text input and names the remove button", async () => {
    render(<RegistrationForm onSubmit={() => {}} />);
    expect(screen.getByLabelText("Question 1 text")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "+ Add another question" })
    );
    expect(
      screen.getByRole("button", { name: "Remove question 1" })
    ).toBeInTheDocument();
  });

  it("prefills questions from initialData", () => {
    const initialData: RegistrationFormData = {
      questions: [
        { id: 11, label: "Dietary restrictions?", type: "text", required: true },
        { id: 12, label: "Team name?", type: "text", required: false },
      ],
    };
    render(<RegistrationForm onSubmit={() => {}} initialData={initialData} />);
    expect(screen.getByDisplayValue("Dietary restrictions?")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Team name?")).toBeInTheDocument();
    expect(screen.getByText("Question 2")).toBeInTheDocument();
  });
});
