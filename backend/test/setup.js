// Global test setup for the backend Vitest suite.
// Runs before every test file (see vitest.config.js -> setupFiles).

process.env.JWT_SECRET =
  process.env.JWT_SECRET || "test-jwt-secret-at-least-32-characters-long!!";
process.env.NODE_ENV = "test";

// Keep Razorpay/SMTP unset so payment/email code takes its "not configured"
// graceful-degradation branches unless a test explicitly overrides them.
delete process.env.RAZORPAY_KEY_ID;
delete process.env.RAZORPAY_KEY_SECRET;
delete process.env.SMTP_HOST;
delete process.env.SMTP_USER;
delete process.env.SMTP_PASS;
