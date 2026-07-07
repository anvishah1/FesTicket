// AUTH-07: single source of truth for the client-side password policy, kept
// byte-for-byte aligned with the backend (auth.js: 8–30 chars + upper/lower/
// number/special) so the client never lets through a password the server 400s.

export interface PasswordCheck {
  label: string;
  ok: boolean;
}

export interface PasswordChecks {
  rules: PasswordCheck[]; // the 5 complexity rules + "passwords match"
  complexityValid: boolean; // the 5 rules only (no match requirement)
  passwordsMatch: boolean;
  valid: boolean; // complexityValid && passwordsMatch
}

export function getPasswordChecks(password: string, confirm: string): PasswordChecks {
  const hasLength = password.length >= 8 && password.length <= 30;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const complexityValid = hasLength && hasUpper && hasLower && hasNumber && hasSpecial;
  const passwordsMatch = password.length > 0 && password === confirm;

  return {
    rules: [
      { label: "8–30 characters", ok: hasLength },
      { label: "One uppercase letter", ok: hasUpper },
      { label: "One lowercase letter", ok: hasLower },
      { label: "One number", ok: hasNumber },
      { label: "One special character", ok: hasSpecial },
      { label: "Passwords match", ok: passwordsMatch },
    ],
    complexityValid,
    passwordsMatch,
    valid: complexityValid && passwordsMatch,
  };
}
