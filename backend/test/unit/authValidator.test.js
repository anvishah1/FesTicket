import { describe, it, expect } from "vitest";
import { signupSchema, signinSchema } from "../../src/validators/authValidator.js";

// Return the first zod issue message for a given top-level field, or undefined.
function fieldError(result, field) {
  return result.error?.issues.find((i) => i.path[0] === field)?.message;
}

describe("signupSchema", () => {
  it("accepts a minimal valid payload (email + strong password)", () => {
    const result = signupSchema.safeParse({
      email: "student@college.edu",
      password: "Password1!",
    });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe("student@college.edu");
  });

  it("accepts an optional name of length >= 2", () => {
    const result = signupSchema.safeParse({
      email: "a@b.com",
      password: "Password1!",
      name: "Al",
    });
    expect(result.success).toBe(true);
  });

  it("accepts wantsEditor as a real boolean and as the string 'true'/'false'", () => {
    for (const wantsEditor of [true, false, "true", "false"]) {
      const result = signupSchema.safeParse({
        email: "a@b.com",
        password: "Password1!",
        wantsEditor,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts a full editor-request payload", () => {
    const result = signupSchema.safeParse({
      email: "a@b.com",
      password: "Password1!",
      name: "Alice",
      wantsEditor: "true",
      festKey: "SPRING2026",
      organizationName: "Music Club",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = signupSchema.safeParse({ email: "not-an-email", password: "Password1!" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "email")).toBe("Invalid email");
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "Pa1!" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "password")).toBe("Password must be at least 8 characters");
  });

  it("rejects a password longer than 30 characters", () => {
    const result = signupSchema.safeParse({
      email: "a@b.com",
      password: "Aa1!Aa1!Aa1!Aa1!Aa1!Aa1!Aa1!Aa1!", // 32 chars, otherwise valid
    });
    expect(result.success).toBe(false);
    expect(fieldError(result, "password")).toBe("Password must be less than 30 characters");
  });

  it("rejects a password with no uppercase letter", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "password1!" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "password")).toBe("Password must contain an uppercase letter");
  });

  it("rejects a password with no lowercase letter", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "PASSWORD1!" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "password")).toBe("Password must contain a lowercase letter");
  });

  it("rejects a password with no number", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "Password!!" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "password")).toBe("Password must contain a number");
  });

  it("rejects a password with no special character", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "Password11" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "password")).toBe("Password must contain a special character");
  });

  it("rejects a name shorter than 2 characters when provided", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "Password1!", name: "A" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "name")).toBe("Name must be at least 2 characters");
  });

  it("rejects a whitespace-only name (trimmed length must still meet the minimum)", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "Password1!", name: "   " });
    expect(result.success).toBe(false);
    expect(fieldError(result, "name")).toBe("Name must be at least 2 characters");
  });

  it("trims a valid name with surrounding whitespace", () => {
    const result = signupSchema.safeParse({ email: "a@b.com", password: "Password1!", name: "  Alice  " });
    expect(result.success).toBe(true);
    expect(result.data.name).toBe("Alice");
  });

  it("rejects an empty festKey when provided", () => {
    const result = signupSchema.safeParse({
      email: "a@b.com",
      password: "Password1!",
      festKey: "",
    });
    expect(result.success).toBe(false);
    expect(fieldError(result, "festKey")).toBe("Fest key is required when requesting editor");
  });

  it("rejects an organizationName shorter than 2 characters when provided", () => {
    const result = signupSchema.safeParse({
      email: "a@b.com",
      password: "Password1!",
      organizationName: "X",
    });
    expect(result.success).toBe(false);
    expect(fieldError(result, "organizationName")).toBe(
      "Organization must be at least 2 characters"
    );
  });

  it("rejects a wantsEditor value that is neither boolean nor 'true'/'false'", () => {
    const result = signupSchema.safeParse({
      email: "a@b.com",
      password: "Password1!",
      wantsEditor: "yes",
    });
    expect(result.success).toBe(false);
    expect(fieldError(result, "wantsEditor")).toBeTruthy();
  });
});

describe("signinSchema", () => {
  it("accepts a valid email + non-empty password", () => {
    const result = signinSchema.safeParse({ email: "a@b.com", password: "anything" });
    expect(result.success).toBe(true);
    expect(result.data.email).toBe("a@b.com");
  });

  it("rejects an invalid email", () => {
    const result = signinSchema.safeParse({ email: "nope", password: "anything" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "email")).toBe("Invalid email");
  });

  it("rejects an empty password", () => {
    const result = signinSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "password")).toBe("Password required");
  });

  it("rejects a missing password field entirely", () => {
    const result = signinSchema.safeParse({ email: "a@b.com" });
    expect(result.success).toBe(false);
    expect(fieldError(result, "password")).toBeTruthy();
  });
});
