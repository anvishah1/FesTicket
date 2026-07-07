import { describe, it, expect } from "vitest";
import { getPasswordChecks } from "@/lib/password";

describe("lib/password getPasswordChecks (AUTH-07)", () => {
  it("marks a fully-valid, matching password as valid", () => {
    const c = getPasswordChecks("NewPassword1!", "NewPassword1!");
    expect(c.complexityValid).toBe(true);
    expect(c.passwordsMatch).toBe(true);
    expect(c.valid).toBe(true);
    expect(c.rules.every((r) => r.ok)).toBe(true);
  });

  it("fails each complexity rule independently", () => {
    expect(getPasswordChecks("short1!", "short1!").rules[0].ok).toBe(false); // < 8
    expect(getPasswordChecks("password1!", "password1!").rules[1].ok).toBe(false); // no upper
    expect(getPasswordChecks("PASSWORD1!", "PASSWORD1!").rules[2].ok).toBe(false); // no lower
    expect(getPasswordChecks("Password!", "Password!").rules[3].ok).toBe(false); // no number
    expect(getPasswordChecks("Password1", "Password1").rules[4].ok).toBe(false); // no special
  });

  it("requires the confirmation to match", () => {
    const c = getPasswordChecks("NewPassword1!", "Different1!");
    expect(c.complexityValid).toBe(true);
    expect(c.passwordsMatch).toBe(false);
    expect(c.valid).toBe(false);
  });

  it("rejects an over-length (>30) password", () => {
    const long = "A1!" + "a".repeat(30);
    expect(getPasswordChecks(long, long).rules[0].ok).toBe(false);
  });
});
