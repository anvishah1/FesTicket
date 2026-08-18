// frontend/lib/email.ts
// A permissive client-side format check — not RFC-5322-exhaustive, just enough
// to reject an obviously malformed value (e.g. "asdf") before it's submitted.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}
