import { describe, it, expect } from "vitest";
import jwt from "jsonwebtoken";
import { generateAccessToken, generateRefreshToken } from "../../src/utils/token.js";

describe("generateAccessToken", () => {
  it("signs a JWT whose payload uses { userId, role } (userId from user.id)", () => {
    const token = generateAccessToken({ id: 123, role: "ADMIN" });
    const decoded = jwt.decode(token);
    expect(decoded.userId).toBe(123);
    expect(decoded.role).toBe("ADMIN");
    // Does NOT put the raw `id` in the payload.
    expect(decoded.id).toBeUndefined();
  });

  it("produces a token that verifies against JWT_SECRET", () => {
    const token = generateAccessToken({ id: 5, role: "VIEWER" });
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    expect(verified.userId).toBe(5);
    expect(verified.role).toBe("VIEWER");
  });

  it("sets a 15-minute (900s) expiry window", () => {
    const token = generateAccessToken({ id: 1, role: "HOST" });
    const decoded = jwt.decode(token);
    expect(decoded.exp - decoded.iat).toBe(15 * 60);
  });

  it("fails verification with the wrong secret", () => {
    const token = generateAccessToken({ id: 1, role: "VIEWER" });
    expect(() => jwt.verify(token, "wrong-secret")).toThrow();
  });
});

describe("generateRefreshToken", () => {
  it("returns an 80-character lowercase hex string (40 random bytes)", () => {
    const token = generateRefreshToken();
    expect(token).toHaveLength(80);
    expect(token).toMatch(/^[0-9a-f]{80}$/);
  });

  it("returns a different value on each call (uniqueness)", () => {
    const set = new Set();
    for (let i = 0; i < 100; i++) set.add(generateRefreshToken());
    expect(set.size).toBe(100);
  });
});
