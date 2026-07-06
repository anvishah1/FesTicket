import jwt from "jsonwebtoken";

/**
 * Sign a real access token matching the app's JWT shape: { userId, role }.
 * authMiddleware reads req.user.userId and req.user.role.
 */
export function signToken({ userId = 1, role = "VIEWER" } = {}) {
  return jwt.sign({ userId, role }, process.env.JWT_SECRET, { expiresIn: "15m" });
}

/** Convenience: an Authorization header tuple for supertest .set(). */
export function bearer(payload) {
  return ["Authorization", `Bearer ${signToken(payload)}`];
}
