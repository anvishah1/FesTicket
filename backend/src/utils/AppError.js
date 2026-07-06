// backend/src/utils/AppError.js
// Typed, expose-safe application error (ARCH-03). The central error handler in
// index.js maps `err instanceof AppError` to its status/code/message; any other
// thrown error becomes a generic 500 with no leaked internals. Generalizes the
// old bookings.js bookingError() factory.
export class AppError extends Error {
  constructor(status, code, message, { expose = true } = {}) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.expose = expose;
  }

  static badRequest(code, message) {
    return new AppError(400, code, message);
  }
  static unauthorized(code, message) {
    return new AppError(401, code, message);
  }
  static forbidden(code, message) {
    return new AppError(403, code, message);
  }
  static notFound(code, message) {
    return new AppError(404, code, message);
  }
  static conflict(code, message) {
    return new AppError(409, code, message);
  }
}

// Backward-compatible drop-in for the old bookings.js bookingError(): returns an
// AppError so it carries .status/.code/.message/.expose exactly as before AND is
// now recognized by the central handler.
export const bookingError = (status, code, message) => new AppError(status, code, message);

export default AppError;
