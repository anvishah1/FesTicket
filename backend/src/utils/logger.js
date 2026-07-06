// backend/src/utils/logger.js
// Structured logging (ARCH-09). Single-line JSON to stdout for a log drain, with
// levels and PII redaction. Silent under NODE_ENV=test to keep test output clean.
import pino from "pino";

const isTest = process.env.NODE_ENV === "test";

const logger = pino({
  level: isTest ? "silent" : process.env.LOG_LEVEL || "info",
  // Never let a secret reach a log line. Covers Authorization headers and the
  // common credential fields whether logged at the top level or nested one deep.
  redact: {
    paths: [
      "req.headers.authorization",
      "headers.authorization",
      "password",
      "newPassword",
      "currentPassword",
      "token",
      "refreshToken",
      "accessToken",
      "captchaToken",
      "*.password",
      "*.newPassword",
      "*.token",
      "*.refreshToken",
      "*.accessToken",
      "*.captchaToken",
    ],
    censor: "[Redacted]",
  },
});

export default logger;
