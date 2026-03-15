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
