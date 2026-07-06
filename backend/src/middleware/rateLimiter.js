import rateLimit from "express-rate-limit";

export const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // max attempts
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    message: "Too many login attempts. Please try again later."
  }
});

// Signup backstop: this is a college-fest app where many students legitimately
// share a campus/NAT IP, so a tight per-IP cap would 429 real users. This is a
// generous runaway-script backstop only (it stops a single IP creating thousands
// of accounts); CAPTCHA is the proper defence for automated sign-up abuse.
export const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // generous backstop for shared IPs
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    message: "Too many signup attempts. Please try again later."
  }
});

// Bookings: guard the create-booking endpoint against rapid inventory grabs.
export const bookingLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // ~30 bookings/min/IP
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    message: "Too many booking attempts. Please slow down and try again."
  }
});

// Generic write throttle for lower-frequency mutating public endpoints
// (forgot-password, admin/role requests, order/verify, sponsor leads).
export const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // ~20 writes/min/IP
  standardHeaders: true,
  legacyHeaders: false,

  message: {
    message: "Too many requests. Please slow down and try again."
  }
});
